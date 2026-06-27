import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useAppStore } from './useAppStore'

const state = () => useAppStore.getState()

beforeEach(async () => {
  await db.profile.clear()
  useAppStore.setState({
    userProfile: null,
    isProfileSetup: false,
    isLoadingProfile: false,
  })
})

describe('useAppStore', () => {
  it('loadProfile yields a null profile (not set up) when none is saved', async () => {
    await state().loadProfile()
    expect(state().userProfile).toBeNull()
    expect(state().isProfileSetup).toBe(false)
    expect(state().isLoadingProfile).toBe(false)
  })

  it('saveProfile persists and caches the profile and marks setup complete', async () => {
    const saved = await state().saveProfile({
      name: 'Aru',
      availableHoursPerDay: 3,
      timezone: 'Europe/Berlin',
    })

    expect(saved.name).toBe('Aru')
    expect(state().userProfile).toEqual(saved)
    expect(state().isProfileSetup).toBe(true)

    // A fresh load (cache reset) reads the same row back from storage.
    useAppStore.setState({ userProfile: null, isProfileSetup: false })
    await state().loadProfile()
    expect(state().userProfile?.name).toBe('Aru')
    expect(state().isProfileSetup).toBe(true)
  })
})
