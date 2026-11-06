export function performanceGate(summary) {
  return Object.values(summary.validity).every(value => value === true) &&
    summary.sequenceCoverageP95Within2s === true &&
    summary.frameIntervalP95Within16_67Ms === true;
}
