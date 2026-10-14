// The expanded bank: one file per tree of the skill map. Each question is
// pinned to its branch, so Know checks draw from the right pool.

import { T0_IOS } from './t0-ios.js';
import { T1_A } from './t1-a.js';
import { T1_B } from './t1-b.js';
import { T2_A } from './t2-a.js';
import { T2_B } from './t2-b.js';
import { T3_A } from './t3-a.js';
import { T3_B } from './t3-b.js';
import { T4 } from './t4.js';
import { T5_A } from './t5-a.js';
import { T5_B } from './t5-b.js';
import { T6 } from './t6.js';
import { X_CONSOLE_A } from './x-console-a.js';
import { X_CONSOLE_B } from './x-console-b.js';
import { X_CONSOLE_C } from './x-console-c.js';
import { DND } from './dnd.js';

export const BANK_EXPANSION = [
  ...T0_IOS,
  ...T1_A,
  ...T1_B,
  ...T2_A,
  ...T2_B,
  ...T3_A,
  ...T3_B,
  ...T4,
  ...T5_A,
  ...T5_B,
  ...T6,
  ...X_CONSOLE_A,
  ...X_CONSOLE_B,
  ...X_CONSOLE_C,
  ...DND,
];
