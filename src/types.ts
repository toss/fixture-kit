/**
 * @description A file tree where string values are file contents and
 * object values are nested directories.
 */
import type { Fixture } from "./fixture.js";

export interface FixtureTree {
  [name: string]: string | FixtureTree;
}

export interface FixtureOptions {
  setup?: (fixture: Fixture) => void | Promise<void>;
  teardown?: (fixture: Fixture) => void | Promise<void>;
}
