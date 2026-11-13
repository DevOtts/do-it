const Base = require('@jest/test-sequencer').default;

// Order by path so the fixture run order is stable: g1, g2, s01 to s28.
class PathSequencer extends Base {
  sort(tests) {
    return Array.from(tests).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
}

module.exports = PathSequencer;
