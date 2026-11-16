#!/usr/bin/env python3
"""Move student documents and quarantine unidentified legacy public uploads."""

import argparse
import hashlib
import os
import shutil
import sqlite3
import stat
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit


PUBLIC_ASSET_DIRS = {'universities', 'website', 'messages'}


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for part in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(part)
    return digest.digest()


def regular_file(path):
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(mode):
        raise ValueError(f'{path} is not a regular file')
    return True


def storage_directory(path):
    resolved = path.resolve()
    if resolved.exists() and not resolved.is_dir():
        raise ValueError(f'{resolved} is not a directory')
    return resolved


def overlaps(left, right):
    if left == right or left in right.parents or right in left.parents:
        return True
    # Existing aliases such as differently cased paths or bind mounts may
    # still resolve to distinct path strings.
    for directory, other in ((left, right), (right, left)):
        if directory.exists():
            if any(parent.exists() and directory.samefile(parent) for parent in (other, *other.parents)):
                return True
    return False


def valid_filename(name):
    return bool(name) and name not in {'.', '..'} and not any(char in name for char in ('/', '\\', '\x00'))


def verified_move(source, destination, has_destination):
    directory = destination.parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not has_destination:
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as temp:
            temp_path = Path(temp.name)
            try:
                with source.open('rb') as original:
                    shutil.copyfileobj(original, temp)
                temp.flush()
                os.fsync(temp.fileno())
                if file_digest(source) != file_digest(temp_path):
                    raise ValueError(f'Copy verification failed: {source.name}')
                # link() is atomic and fails if a competing/case-folded name
                # already exists. Never replace a destination during cutover.
                os.link(temp_path, destination)
            finally:
                temp_path.unlink(missing_ok=True)
    elif file_digest(source) != file_digest(destination):
        raise ValueError(f'Existing destination changed before source removal: {source.name}')
    source.unlink()


def inspect_regular_tree(directory, label):
    """Return regular files below a storage tree, rejecting links and devices."""
    files = []
    for current, directories, names in os.walk(directory, topdown=True, followlinks=False):
        current_path = Path(current)
        for name in list(directories):
            entry = current_path / name
            mode = entry.lstat().st_mode
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise ValueError(f'Unsafe entry in {label}: {entry}')
        for name in names:
            entry = current_path / name
            if not regular_file(entry):
                raise ValueError(f'Unsafe entry in {label}: {entry}')
            files.append(entry)
    return files


def move_files(database, root, apply):
    public_root = storage_directory(root / 'public')
    public = storage_directory(root / 'public' / 'uploads')
    private = storage_directory(root / 'storage' / 'student-documents')
    quarantine = storage_directory(root / 'storage' / 'unidentified-student-uploads')
    if any(overlaps(source, destination) for source in (public_root, public) for destination in (private, quarantine)):
        raise ValueError('Public storage overlaps private storage or quarantine')
    if overlaps(private, quarantine):
        raise ValueError('Private storage overlaps quarantine')

    with sqlite3.connect(f'{database.as_uri()}?mode=ro', uri=True) as conn:
        filenames = {row[0] for row in conn.execute('SELECT DISTINCT filename FROM Document')}
        message_urls = set()
        for (url,) in conn.execute('SELECT DISTINCT attachmentUrl FROM Message WHERE attachmentUrl IS NOT NULL'):
            parsed = urlsplit(url)
            path = unquote(parsed.path)
            if not parsed.scheme and not parsed.netloc and path.startswith('/uploads/'):
                message_urls.add(path)

    entries = {entry.name: entry for entry in public.iterdir()} if public.exists() else {}
    documented_moves = []
    quarantine_moves = []
    already_private = 0
    problems = []
    preserved_files = []
    for asset_name in sorted(PUBLIC_ASSET_DIRS):
        asset_dir = public / asset_name
        if asset_dir.exists() or asset_dir.is_symlink():
            try:
                mode = asset_dir.lstat().st_mode
                if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                    raise ValueError(f'Unsafe preserved public asset path: {asset_dir}')
                if overlaps(asset_dir.resolve(), private) or overlaps(asset_dir.resolve(), quarantine):
                    raise ValueError(f'Public asset directory overlaps private storage or quarantine: {asset_dir}')
                preserved_files.extend(inspect_regular_tree(asset_dir, 'preserved public asset tree'))
            except (OSError, ValueError) as error:
                problems.append(str(error))
    preserved_inodes = {(path.stat().st_dev, path.stat().st_ino) for path in preserved_files}
    for storage_path, label in ((private, 'private student-document storage'),
                                 (quarantine, 'existing quarantine storage')):
        try:
            for stored_file in inspect_regular_tree(storage_path, label):
                if (stored_file.stat().st_dev, stored_file.stat().st_ino) in preserved_inodes:
                    problems.append(f'Hard-link alias between preserved public asset and {label}: {stored_file}')
        except (OSError, ValueError) as error:
            problems.append(str(error))

    def plan_move(source, destination, moves):
        has_destination = regular_file(destination)
        if has_destination:
            if source.samefile(destination):
                raise ValueError(f'Public and destination files are aliases: {source.name}')
            if file_digest(source) != file_digest(destination):
                raise ValueError(f'Public and destination files differ: {source.name}')
        moves.append((source, destination, has_destination))

    for name in sorted(filenames):
        if not valid_filename(name):
            problems.append(f'Invalid stored filename: {name!r}')
            continue
        source, destination = public / name, private / name
        try:
            if not regular_file(source):
                if regular_file(destination):
                    already_private += 1
                else:
                    problems.append(f'Missing file: {name}')
                continue
            if name not in entries:
                raise ValueError(f'Document name aliases a public file with a different name: {name}')
            if (source.stat().st_dev, source.stat().st_ino) in preserved_inodes:
                raise ValueError(f'Student document has a hard-link alias in a preserved public asset tree: {name}')
            plan_move(source, destination, documented_moves)
        except ValueError as error:
            problems.append(str(error))

    for name, source in sorted(entries.items()):
        if name in filenames:
            continue
        try:
            if name in PUBLIC_ASSET_DIRS and source.is_dir() and not source.is_symlink():
                continue
            if not regular_file(source):
                raise ValueError(f'Public upload disappeared during inventory: {source}')
            if (source.stat().st_dev, source.stat().st_ino) in preserved_inodes:
                raise ValueError(f'Unidentified upload has a hard-link alias in a preserved public asset tree: {name}')
            plan_move(source, quarantine / name, quarantine_moves)
        except ValueError as error:
            problems.append(str(error))

    print(f'{len(documented_moves)} documents to move, {len(quarantine_moves)} unidentified files to quarantine, '
          f'{already_private} documents already private, {len(problems)} unresolved.')
    for source, _, _ in quarantine_moves:
        print(f'Quarantine: {source.name}')
    for url in sorted(message_urls):
        if '/' not in url.removeprefix('/uploads/'):
            print(f'Legacy message URL requires review/re-upload before cutover: {url}')
    if problems:
        for problem in problems:
            print(problem)
        raise SystemExit('Resolve these files before applying the move.')
    if not apply:
        print('Dry run; no files changed. Pass --apply to move and quarantine the listed files.')
        return

    for source, destination, has_destination in documented_moves + quarantine_moves:
        verified_move(source, destination, has_destination)
    print(f'Moved {len(documented_moves)} student document files to {private}.')
    print(f'Quarantined {len(quarantine_moves)} unidentified files in {quarantine}.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path, help='Absolute path to the SQLite database')
    parser.add_argument('project_root', type=Path, help='Directory containing public/ and storage/')
    parser.add_argument('--apply', action='store_true', help='Move and quarantine files after validating the inventory')
    args = parser.parse_args()
    try:
        move_files(args.database.resolve(strict=True), args.project_root.resolve(strict=True), args.apply)
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'{error}\n')
