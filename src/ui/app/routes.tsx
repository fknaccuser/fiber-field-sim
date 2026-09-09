import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Dispatch } from '../dispatch/Dispatch';
import { ScenarioPicker } from '../screens/ScenarioPicker';
import { FieldSession } from '../screens/FieldSession';
import { PreTrip } from '../prep/PreTrip';
import { Replay } from '../screens/Replay';
import { History } from '../screens/History';
import { DevOtdr } from '../screens/DevOtdr';
import { SpliceBench } from '../operations/SpliceBench';
import { AcceptanceBench } from '../operations/AcceptanceBench';
import { SpliceRun } from '../operations/SpliceRun';
import { LocateBench } from '../operations/LocateBench';
import { CutInBench } from '../operations/CutInBench';

// The only 3D left in the project. Kept out of the main chunk so nobody downloads three.js
// to read a print.
const SpliceTrayBench = lazy(() => import('../operations/SpliceTrayBench').then((m) => ({ default: m.SpliceTrayBench })));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dispatch />} />
      <Route path="/scenarios" element={<ScenarioPicker />} />
      <Route path="/prep/:scenarioId" element={<PreTrip />} />
      <Route path="/run/:scenarioId" element={<FieldSession />} />
      <Route path="/replay/:sessionId" element={<Replay />} />
      <Route path="/history" element={<History />} />
      <Route path="/compare/:a/:b" element={<Replay />} />
      <Route path="/bench/splice" element={<SpliceBench />} />
      <Route path="/bench/test" element={<AcceptanceBench />} />
      <Route path="/bench/run" element={<SpliceRun />} />
      <Route path="/bench/locate" element={<LocateBench />} />
      <Route path="/bench/cut-in" element={<CutInBench />} />
      <Route path="/bench/tray" element={<Suspense fallback={<div style={{ padding: 16, color: 'var(--muted)' }}>Opening the case…</div>}><SpliceTrayBench /></Suspense>} />
      <Route path="/dev/otdr" element={<DevOtdr />} />
    </Routes>
  );
}
