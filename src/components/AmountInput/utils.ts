/** Characters that survive cleaning an amount: digits and the decimal mark. */
const KEPT = /[0-9.]/

/** How many digits and "." come before `caret` in what the user typed. */
export function keptBefore(text: string, caret: number): number {
  return [...text.slice(0, caret)].filter((char) => KEPT.test(char)).length
}

/**
 * Where the caret goes in the reformatted amount so it stays after the same
 * digit: after `kept` digits and "." of `shown`, skipping the separators the
 * field added. "1234|" typed as "1,234" keeps the caret at the end; typing a
 * digit in the middle keeps it right after that digit.
 */
export function caretAfter(shown: string, kept: number): number {
  if (kept <= 0) return 0
  let count = 0
  for (let index = 0; index < shown.length; index++) {
    if (KEPT.test(shown[index])) count++
    if (count === kept) return index + 1
  }
  return shown.length
}
