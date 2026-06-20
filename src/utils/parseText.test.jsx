import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { parseText } from './parseText'

// parseText returns a plain string when there are no bold markers, and an
// array of React nodes (strings + <strong>) when there are. Rendering the
// result inside a wrapper lets us assert the produced DOM regardless of form.
function renderParsed(input) {
  return render(<div data-testid="out">{parseText(input)}</div>)
}

describe('parseText', () => {
  it('returns the input unchanged when there are no bold markers', () => {
    expect(parseText('plain text')).toBe('plain text')
  })

  it('returns falsy input as-is', () => {
    expect(parseText('')).toBe('')
    expect(parseText(undefined)).toBe(undefined)
    expect(parseText(null)).toBe(null)
  })

  it('wraps bolded segments in <strong>', () => {
    renderParsed('hello **world**')
    const strong = screen.getByText('world')
    expect(strong.tagName).toBe('STRONG')
    expect(screen.getByTestId('out')).toHaveTextContent('hello world')
  })

  it('handles multiple bold segments', () => {
    const { container } = renderParsed('**a** and **b**')
    const strongs = container.querySelectorAll('strong')
    expect(strongs).toHaveLength(2)
    expect(strongs[0]).toHaveTextContent('a')
    expect(strongs[1]).toHaveTextContent('b')
  })

  it('preserves surrounding plain text around bold', () => {
    renderParsed('start **mid** end')
    expect(screen.getByTestId('out')).toHaveTextContent('start mid end')
  })

  it('renders bold at the very start of the string', () => {
    const { container } = renderParsed('**bold** trailing')
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(screen.getByTestId('out')).toHaveTextContent('bold trailing')
  })
})
