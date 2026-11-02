import { NextRequest, NextResponse } from 'next/server'
import { getEffectiveUser } from '@/src/lib/session'
import { canManageSiteContent } from '@/src/lib/siteContentAccess'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
export async function POST(req: NextRequest) {
 if (!canManageSiteContent(await getEffectiveUser(req))) return NextResponse.json({error:'Forbidden'},{status:403})
 const form=await req.formData(); const file=form.get('file')
 if (!(file instanceof File) || file.size > 3*1024*1024 || !file.size) return NextResponse.json({error:'Choose an image up to 3 MB'},{status:400})
 const data=Buffer.from(await file.arrayBuffer())
 const ext=data.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpg':data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'?'webp':null
 if (!ext) return NextResponse.json({error:'Use a JPG, PNG or WebP image'},{status:400})
 const dir=join(process.cwd(),'public/uploads/website');await mkdir(dir,{recursive:true});const name=randomUUID()+'.'+ext;await writeFile(join(dir,name),data)
 return NextResponse.json({url:'https://portal.edvuno.top/uploads/website/'+name})
}
