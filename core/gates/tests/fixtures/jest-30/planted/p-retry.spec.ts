jest.retryTimes(2);
let attempts = 0;

test('passes on the second attempt', () => {
  attempts += 1;
  if (attempts === 1) throw new Error('first attempt fails');
  expect(attempts).toBe(2);
});
