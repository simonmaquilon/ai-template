// The iOS operations of device.mjs on simulators that already exist, through the two system tools at fixed paths. Each
// takes run(file, args, options), which a test replaces, and no variable or option picks the binary.

import { clean, matchSimulator, parseSimulators } from './device-parse.mjs';
import { must } from './device-run.mjs';

export const XCRUN = '/usr/bin/xcrun';
export const XCODE_SELECT = '/usr/bin/xcode-select';
const simctl = (run, args, options) => run(XCRUN, ['simctl', ...args], options);
const label = (sim) => `${clean(sim.name)} (${sim.udid})`;

export const simulators = (run, timeout = 30000) => parseSimulators(must(simctl(run, ['list', 'devices', 'available', '--json'], { timeout }), 'simctl list devices'));

// Boots a simulator and waits for it, all within `timeout` seconds: every tool gets at most the time that is left.
export function boot(run, target, { timeout, now = Date.now }) {
  const deadline = now() + timeout * 1000;
  const left = () => Math.max(deadline - now(), 1);
  const sim = matchSimulator(simulators(run, Math.min(30000, left())), target);
  if (sim.state === 'Booted') return `${label(sim)} is already booted`;
  if (sim.state !== 'Booting') must(simctl(run, ['boot', sim.udid], { timeout: left() }), 'simctl boot');
  must(simctl(run, ['bootstatus', sim.udid], { timeout: left() }), 'simctl bootstatus');
  return `${label(sim)} booted`;
}

export function shutdown(run, target) {
  const sim = matchSimulator(simulators(run), target);
  if (sim.state === 'Shutdown') return `${label(sim)} is already shut down`;
  must(simctl(run, ['shutdown', sim.udid]), 'simctl shutdown');
  return `${label(sim)} shut down`;
}
