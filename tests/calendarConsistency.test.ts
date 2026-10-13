import { expect, it } from 'vitest';
import { calendarCandidates } from '../utils/novel/v3/calendarConsistency';

it('finds an impossible ordinal weekday without assuming a year', () => {
  const text = 'The lunch was held on the third Thursday of the month, which this year was the twenty-third.';
  const [finding] = calendarCandidates([{ id: 'p1', text }]);
  expect(finding.day).toBe(23); expect(finding.allowed).toEqual([15, 21]);
  expect(text.slice(finding.start, finding.end)).toBe(finding.quote);
});
it('accepts valid ordinal weekdays and does not infer dates from unrelated counts', () => {
  expect(calendarCandidates([{ id: 'p1', text: 'The third Thursday of the month was the eighteenth. The fourth Thursday of May was the 23rd. The fifth Monday in May is the thirty-first.' }])).toEqual([]);
  expect(calendarCandidates([{ id: 'p1', text: 'The third Thursday of the month had twenty-three guests.' }])).toEqual([]);
});
it('preserves the original statement without pretending to know whether its speaker lies', () => {
  const [finding] = calendarCandidates([{ id: 'p1', text: '"The first Monday of May is the twentieth," the suspect lied.' }]);
  expect(finding.allowed).toEqual([1, 7]); expect(finding.day).toBe(20);
  expect(finding).not.toHaveProperty('verdict');
});
