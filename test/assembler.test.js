const test = require('node:test');
const assert = require('node:assert/strict');
const { CaptionAssembler } = require('../public/assembler');

test('keeps the latest version of a growing caption and saves it once', () => {
  const collector = new CaptionAssembler();
  assert.deepEqual(collector.observe('Welcome everyone', 1000), []);
  assert.deepEqual(collector.observe('Welcome everyone to class', 2000), []);
  assert.deepEqual(collector.observe('Next topic', 3000), []);
  assert.deepEqual(collector.observe('Next topic', 6000), ['Welcome everyone to class']);
  assert.deepEqual(collector.flush(7000), ['Next topic']);
});

test('does not save an unchanged caption repeatedly', () => {
  const collector = new CaptionAssembler();
  collector.observe('The mean is the average', 1000);
  collector.observe('The mean is the average', 2000);
  assert.deepEqual(collector.observe('', 3000), []);
  assert.deepEqual(collector.observe('', 6000), ['The mean is the average']);
  collector.observe('The mean is the average', 7000);
  assert.deepEqual(collector.flush(8000), []);
});
