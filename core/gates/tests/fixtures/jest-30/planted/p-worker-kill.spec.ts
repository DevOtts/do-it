test('kills its own worker', () => {
  process.kill(process.pid, 'SIGKILL');
});
