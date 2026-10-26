// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GroupTypeSelector } from '../index.tsx'

describe('GroupTypeSelector', () => {
  afterEach(cleanup)

  it('draws each type as a tile that can travel into a new group\'s band (PRD 5.16)', () => {
    render(<GroupTypeSelector value="trip" />)

    for (const label of ['Trip', 'Home', 'Couple', 'Other']) {
      expect(screen.getByRole('img', { name: label }).querySelector('[data-vt="block"]')).not.toBeNull()
    }
  })
})
