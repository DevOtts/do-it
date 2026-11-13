throw new Error('boom at import');

test('never runs', () => {
  expect(1).toBe(1);
});
