import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDayKey, findDayMentions, resolveDayPhrase, shortDayLabel } from './day-phrase.ts';

const MONDAY = '2026-09-28';

const day = (phrase: string, today = MONDAY) => {
  const result = resolveDayPhrase(phrase, today);
  return 'dateKey' in result ? result.dateKey : result.error;
};

test('relative days', () => {
  assert.equal(day(''), MONDAY);
  assert.equal(day('today'), MONDAY);
  assert.equal(day('Tomorrow?'), '2026-09-29');
  assert.equal(day('tmrw'), '2026-09-29');
  assert.equal(day('the day after tomorrow'), '2026-09-30');
  assert.equal(day('yesterday'), '2026-09-27');
  assert.equal(day('in 3 days'), '2026-10-01');
  assert.equal(day('in two weeks'), '2026-10-12');
  assert.equal(day('5 days from now'), '2026-10-03');
});

test('weekdays: the coming one, "next", "next week", "after next"', () => {
  assert.equal(day('Sunday'), '2026-10-04');
  assert.equal(day('on sunday'), '2026-10-04');
  assert.equal(day('this Sunday'), '2026-10-04');
  assert.equal(day('next Sunday'), '2026-10-04');
  assert.equal(day('Friday'), '2026-10-02');
  assert.equal(day('monday'), MONDAY, 'naming today means today');
  assert.equal(day('next monday'), '2026-10-05');
  assert.equal(day('wednesday next week'), '2026-10-07');
  assert.equal(day('the sunday after next'), '2026-10-11');
  assert.equal(day('the weekend'), '2026-10-03');
  assert.equal(day('Thurs'), '2026-10-01');
});

test('calendar dates in every common form', () => {
  assert.equal(day('15th of Oct'), '2026-10-15');
  assert.equal(day('on the 15th of October'), '2026-10-15');
  assert.equal(day('Oct 15'), '2026-10-15');
  assert.equal(day('October 15th'), '2026-10-15');
  assert.equal(day('15 October 2026'), '2026-10-15');
  assert.equal(day('10/15'), '2026-10-15');
  assert.equal(day('2026-10-15'), '2026-10-15');
  assert.equal(day('the 15th'), '2026-10-15', 'the 15th has passed this month, so next month');
  assert.equal(day('the 30th'), '2026-09-30');
  assert.equal(day('Jan 5'), '2027-01-05', 'more than two months back rolls to next year');
  assert.equal(day('Sep 24'), '2026-09-24');
});

test('past days, weekday-plus-date and everyday variants', () => {
  assert.equal(day('last Friday'), '2026-09-25');
  assert.equal(day('last monday'), '2026-09-21');
  assert.equal(day('the day before yesterday'), '2026-09-26');
  assert.equal(day('3 days ago'), '2026-09-25');
  assert.equal(day('a week ago'), '2026-09-21');
  assert.equal(day('Friday the 25th'), '2026-09-25', 'the weekday picks the month, not "next 25th"');
  assert.equal(day('Sunday the 4th'), '2026-10-04');
  assert.equal(day('Thursday, October 15'), '2026-10-15');
  assert.equal(day('next Sunday, Oct 4'), '2026-10-04');
  assert.equal(day('15/10'), '2026-10-15', 'day-first when the first number cannot be a month');
  assert.equal(day('tomorrow morning'), '2026-09-29');
  assert.equal(day("tomorrow's"), '2026-09-29');
  assert.equal(day('Oct 15.'), '2026-10-15');
});

test('nonsense and far-away days are refused rather than guessed', () => {
  assert.equal(day('sometime soon'), 'unclear');
  assert.equal(day('Feb 30'), 'unclear');
  assert.equal(day('in 400 days'), 'out_of_range');
});

test('labels name the exact date', () => {
  assert.equal(describeDayKey('2026-10-04', MONDAY), 'Sunday, Oct 4');
  assert.equal(describeDayKey('2026-09-29', MONDAY), 'Tomorrow (Tuesday, Sep 29)');
  assert.equal(shortDayLabel('2026-10-15', MONDAY), 'Thu, Oct 15');
  assert.equal(shortDayLabel('2026-09-29', MONDAY), 'Tomorrow');
});

test('spelled-out ordinals, the way voice transcripts come in', () => {
  assert.equal(day('october fifteenth'), '2026-10-15');
  assert.equal(day('the twenty-fifth of september'), '2026-09-25');
  assert.equal(day('friday the twenty fifth'), '2026-09-25');
  assert.equal(day('thursday the first'), '2026-10-01');
});

test('finds the days a message names, and ignores workout talk', () => {
  const found = (text: string) => findDayMentions(text, MONDAY).map((m) => `${m.phrase}=${m.dateKey}`);
  assert.deepEqual(found('what was i supposed to do friday the 25th'), ['friday the 25th=2026-09-25']);
  assert.deepEqual(found("What's my workout tomorrow?"), ['tomorrow=2026-09-29']);
  assert.deepEqual(found('and what about next sunday'), ['next sunday=2026-10-04']);
  assert.deepEqual(found('What am i doing on 15th of oct'), ['15th of oct=2026-10-15']);
  assert.deepEqual(found('whats on Oct 15 and the day after tomorrow'), ['oct 15=2026-10-15', 'the day after tomorrow=2026-09-30']);
  assert.deepEqual(found('what did i do last friday'), ['last friday=2026-09-25']);
  assert.deepEqual(found('can i train on the 3rd'), ['the 3rd=2026-10-03']);
  assert.deepEqual(found('I did it 3 days ago'), ['3 days ago=2026-09-25']);
  assert.deepEqual(found('is friday the twenty fifth a rest day'), ['friday the 25th=2026-09-25']);
  assert.deepEqual(found('in two weeks'), ['in two weeks=2026-10-12']);

  for (const workoutTalk of [
    'what is today',
    'I did the 3rd set at 40',
    'on the 2nd set I got 8',
    'done 40/8',
    'I sat down for a minute',
    'the first exercise felt heavy',
    'rest 90 seconds',
    'I may do 5 more',
    '12 reps at 55 lb',
    'make it 45',
    'second set done, 10 reps',
  ]) {
    assert.deepEqual(found(workoutTalk), [], workoutTalk);
  }
});
