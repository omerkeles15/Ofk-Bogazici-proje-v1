import { useState, useMemo, useCallback } from 'react'

/**
 * useFormValidation — Form doğrulama hook'u
 * @param {Object} rules - { fieldName: (value) => errorMessage | null }
 * @returns {{ errors: Object, validate: (formData) => boolean, clearErrors: () => void, isValid: boolean }}
 */
export const useFormValidation = (rules) => {
  const [errors, setErrors] = useState({})

  const validate = useCallback(
    (formData) => {
      const newErrors = {}
      let allValid = true

      for (const [field, rule] of Object.entries(rules)) {
        const error = rule(formData[field])
        if (error) {
          newErrors[field] = error
          allValid = false
        }
      }

      setErrors(newErrors)
      return allValid
    },
    [rules]
  )

  const clearErrors = useCallback(() => {
    setErrors({})
  }, [])

  const isValid = useMemo(
    () => Object.keys(errors).length === 0,
    [errors]
  )

  return { errors, validate, clearErrors, isValid }
}
