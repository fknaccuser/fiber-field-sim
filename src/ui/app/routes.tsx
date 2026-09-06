import { Route, Routes } from 'react-router-dom';
import { Home } from '../screens/Home';
import { ScenarioPicker } from '../screens/ScenarioPicker';
import { FieldSession } from '../screens/FieldSession';
import { Replay } from '../screens/Replay';
import { History } from '../screens/History';
import { DevOtdr } from '../screens/DevOtdr';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/scenarios" element={<ScenarioPicker />} />
      <Route path="/run/:scenarioId" element={<FieldSession />} />
      <Route path="/replay/:sessionId" element={<Replay />} />
      <Route path="/history" element={<History />} />
      <Route path="/compare/:a/:b" element={<Replay />} />
      <Route path="/dev/otdr" element={<DevOtdr />} />
    </Routes>
  );
}
