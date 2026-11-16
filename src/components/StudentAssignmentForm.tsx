'use client'

import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/src/lib/i18n/LanguageContext'

type AgentOption = { id: string; name: string }

export function useAssignableAgents(enabled: boolean, organizationId?: string | null) {
  const [roster, setRoster] = useState<{ organizationId?: string | null; agents: AgentOption[]; failed: boolean }>()
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/api/students/assignment-agents', { signal: controller.signal, cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error()
        const agents: AgentOption[] = await res.json()
        if (!controller.signal.aborted) setRoster({ organizationId, agents, failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setRoster({ organizationId, agents: [], failed: true })
      })
    return () => controller.abort()
  }, [enabled, organizationId])

  if (!enabled || !roster || roster.organizationId !== organizationId) return { agents: [], failed: false }
  return roster
}

export function StudentAgentSelect({ value, onChange, agents, currentAgent, disabled }: {
  value: string
  onChange: (id: string) => void
  agents: AgentOption[]
  currentAgent?: AgentOption | null
  disabled?: boolean
}) {
  const { t } = useLanguage()
  return (
    <label className="block text-sm font-medium text-foreground">
      {t('students.assignedAgent')}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
        disabled={disabled}
      >
        <option value="">{t('students.unassigned')}</option>
        {currentAgent && !agents.some(agent => agent.id === currentAgent.id) && (
          <option value={currentAgent.id} disabled>{currentAgent.name}</option>
        )}
        {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
      </select>
    </label>
  )
}

export function StudentAssignmentForm({ student, agents, onSaved }: {
  student: { id: string; agent: AgentOption | null; assignmentVersion: number }
  agents: AgentOption[]
  onSaved: () => void | Promise<void>
}) {
  const { t } = useLanguage()
  const [agentId, setAgentId] = useState(student.agent?.id ?? '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const currentId = student.agent?.id ?? ''

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || agentId === currentId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/students/${student.id}/assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agentId || null, note, expectedAssignmentVersion: student.assignmentVersion }),
      })
      if (res.status === 409) {
        toast.error(t('students.assignmentChanged'))
        await onSaved()
        return
      }
      if (!res.ok) throw new Error()
      setNote('')
      toast.success(t('students.assignmentSaved'))
      await onSaved()
    } catch {
      toast.error(t('students.assignmentFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="min-w-52 space-y-3">
      <StudentAgentSelect value={agentId} onChange={setAgentId} agents={agents} currentAgent={student.agent} disabled={saving} />
      <label className="block text-sm font-medium text-foreground">
        {t('students.assignmentNote')}
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          rows={2}
          disabled={saving}
          className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={saving || agentId === currentId}
        className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {t(saving ? 'common.loading' : 'students.saveAssignment')}
      </button>
    </form>
  )
}
