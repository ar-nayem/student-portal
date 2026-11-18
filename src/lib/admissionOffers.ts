import { NextResponse } from 'next/server'

const TUITION_PERIODS = ['SEMESTER', 'YEAR'] as const
const HOSTEL_PERIODS = ['MONTH', 'SEMESTER', 'YEAR'] as const
const STATES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const

type Payload = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const nullableText = (value: unknown) => text(value) || null

function optionalNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number`)
  return parsed
}

function optionalInt(value: unknown, label: string): number | null {
  const parsed = optionalNumber(value, label)
  if (parsed !== null && !Number.isInteger(parsed)) throw new Error(`${label} must be a whole number`)
  return parsed
}

function optionalDate(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date`)
  if (label === 'End date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) date.setUTCHours(23, 59, 59, 999)
  return date
}

export function parseAdmissionOffer(input: Payload) {
  const privateUniversityName = text(input.privateUniversityName)
  const publicTitle = text(input.publicTitle)
  const city = text(input.city)
  const program = text(input.program)
  if (!privateUniversityName || !publicTitle || !city || !program) {
    throw new Error('University name, public title, city and program are required')
  }
  const status = input.status === undefined ? 'DRAFT' : input.status
  const tuitionPeriod = input.tuitionPeriod === undefined ? 'SEMESTER' : input.tuitionPeriod
  const hostelPeriod = input.hostelPeriod === undefined ? 'MONTH' : input.hostelPeriod
  if (!STATES.includes(status as typeof STATES[number])) throw new Error('Invalid publication status')
  if (!TUITION_PERIODS.includes(tuitionPeriod as typeof TUITION_PERIODS[number])) throw new Error('Invalid tuition period')
  if (!HOSTEL_PERIODS.includes(hostelPeriod as typeof HOSTEL_PERIODS[number])) throw new Error('Invalid hostel period')

  const tuitionMin = optionalNumber(input.tuitionMin, 'Tuition minimum')
  const tuitionMax = optionalNumber(input.tuitionMax, 'Tuition maximum')
  const hostelMin = optionalNumber(input.hostelMin, 'Hostel minimum')
  const hostelMax = optionalNumber(input.hostelMax, 'Hostel maximum')
  const stipendMin = optionalNumber(input.stipendMin, 'Stipend minimum')
  const stipendMax = optionalNumber(input.stipendMax, 'Stipend maximum')
  const minAge = optionalInt(input.minAge, 'Minimum age')
  const maxAge = optionalInt(input.maxAge, 'Maximum age')
  const startsAt = optionalDate(input.startsAt, 'Start date')
  const endsAt = optionalDate(input.endsAt, 'End date')
  for (const [label, min, max] of [
    ['Tuition', tuitionMin, tuitionMax], ['Hostel fee', hostelMin, hostelMax], ['Stipend', stipendMin, stipendMax], ['Age', minAge, maxAge],
  ] as const) {
    if (min !== null && max !== null && max < min) throw new Error(`${label} maximum must be greater than or equal to its minimum`)
  }
  if (startsAt && endsAt && endsAt < startsAt) throw new Error('End date must be after start date')

  const visible = (key: string, fallback: boolean) => typeof input[key] === 'boolean' ? input[key] as boolean : fallback
  return {
    privateUniversityName, exactLocation: nullableText(input.exactLocation), publicTitle,
    publicDescription: text(input.publicDescription), city, program, intake: nullableText(input.intake),
    minAge, maxAge, tuitionMin, tuitionMax, tuitionPeriod: tuitionPeriod as string,
    hostelMin, hostelMax, hostelPeriod: hostelPeriod as string, stipendMin, stipendMax,
    status: status as string, startsAt, endsAt,
    showUniversityName: visible('showUniversityName', false), showExactLocation: visible('showExactLocation', false),
    showCity: visible('showCity', true), showProgram: visible('showProgram', true), showAge: visible('showAge', true),
    showTuition: visible('showTuition', true), showHostel: visible('showHostel', true), showStipend: visible('showStipend', true),
  }
}

export function publicAdmissionOffer(offer: Record<string, any>) {
  const result: Record<string, unknown> = { id: offer.id, title: offer.publicTitle, description: offer.publicDescription }
  if (offer.showUniversityName) result.universityName = offer.privateUniversityName
  if (offer.showExactLocation && offer.exactLocation) result.exactLocation = offer.exactLocation
  if (offer.showCity) result.city = offer.city
  if (offer.showProgram) result.program = offer.program
  if (offer.showProgram && offer.intake) result.intake = offer.intake
  if (offer.showAge && (offer.minAge !== null || offer.maxAge !== null)) {
    result.minAge = offer.minAge
    result.maxAge = offer.maxAge
  }
  if (offer.showTuition && (offer.tuitionMin !== null || offer.tuitionMax !== null)) {
    result.tuitionMin = offer.tuitionMin
    result.tuitionMax = offer.tuitionMax
    result.tuitionPeriod = offer.tuitionPeriod
  }
  if (offer.showHostel && (offer.hostelMin !== null || offer.hostelMax !== null)) {
    result.hostelMin = offer.hostelMin
    result.hostelMax = offer.hostelMax
    result.hostelPeriod = offer.hostelPeriod
  }
  if (offer.showStipend && (offer.stipendMin !== null || offer.stipendMax !== null)) {
    result.stipendMin = offer.stipendMin
    result.stipendMax = offer.stipendMax
    result.stipendPeriod = 'MONTH'
  }
  return result
}

export function parseOfferError(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid admission offer' }, { status: 400 })
}
