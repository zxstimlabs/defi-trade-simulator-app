import { atomWithStorage } from "jotai/utils"

export const passwordAtom = atomWithStorage<string | null>(
  "password",
  null,
  {
    getItem: (key) => {
      const v = sessionStorage.getItem(key)
      return v ? JSON.parse(v) : null
    },
    setItem: (key, value) => {
      sessionStorage.setItem(key, JSON.stringify(value))
    },
    removeItem: (key) => {
      sessionStorage.removeItem(key)
    },
  },
)
