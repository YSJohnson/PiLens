import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FollowUpBehavior = 'followUp' | 'steer'
export type ThemePreference = 'dark' | 'light' | 'system'
export type AutoNamingPreference = 'smart' | 'prompt' | 'off'

interface UiPreferencesState {
  thinkingDefaultExpanded: boolean
  toolOutputDefaultExpanded: boolean
  followUpBehavior: FollowUpBehavior
  collapseLongUserMessages: boolean
  completionSound: boolean
  themePreference: ThemePreference
  autoNamingMode: AutoNamingPreference
  setThinkingDefaultExpanded: (expanded: boolean) => void
  setToolOutputDefaultExpanded: (expanded: boolean) => void
  setFollowUpBehavior: (behavior: FollowUpBehavior) => void
  setCollapseLongUserMessages: (collapsed: boolean) => void
  setCompletionSound: (enabled: boolean) => void
  setThemePreference: (theme: ThemePreference) => void
  setAutoNamingMode: (mode: AutoNamingPreference) => void
}

export const useUiPreferences = create<UiPreferencesState>()(
  persist(
    (set) => ({
      thinkingDefaultExpanded: true,
      toolOutputDefaultExpanded: true,
      followUpBehavior: 'followUp',
      collapseLongUserMessages: false,
      completionSound: true,
      themePreference: 'dark',
      autoNamingMode: 'smart',
      setThinkingDefaultExpanded: (thinkingDefaultExpanded) => set({ thinkingDefaultExpanded }),
      setToolOutputDefaultExpanded: (toolOutputDefaultExpanded) => set({ toolOutputDefaultExpanded }),
      setFollowUpBehavior: (followUpBehavior) => set({ followUpBehavior }),
      setCollapseLongUserMessages: (collapseLongUserMessages) => set({ collapseLongUserMessages }),
      setCompletionSound: (completionSound) => set({ completionSound }),
      setThemePreference: (themePreference) => set({ themePreference }),
      setAutoNamingMode: (autoNamingMode) => set({ autoNamingMode }),
    }),
    {
      name: 'pi-desktop:ui-preferences',
      version: 2,
      migrate: (persistedState) => persistedState as UiPreferencesState,
    },
  ),
)
