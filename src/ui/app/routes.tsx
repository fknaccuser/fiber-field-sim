import { Route, Routes } from 'react-router-dom';
import { Dispatch } from '../dispatch/Dispatch';
import { ScenarioPicker } from '../screens/ScenarioPicker';
import { FieldSession } from '../screens/FieldSession';
import { PreTrip } from '../prep/PreTrip';
import { Replay } from '../screens/Replay';
import { History } from '../screens/History';
import { DevOtdr } from '../screens/DevOtdr';
import { TrayBench } from '../operations/TrayBench';
import { SpliceBench } from '../operations/SpliceBench';

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
      <Route path="/bench/tray" element={<TrayBench />} />
      <Route path="/bench/splice" element={<SpliceBench />} />
      <Route path="/dev/otdr" element={<DevOtdr />} />
    </Routes>
  );
}
