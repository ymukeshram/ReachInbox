import { useEffect, useState } from 'react';
import { subscribeProgress } from '../utils/progressBar';

/** Slim animated bar pinned to the viewport top, active while any API request is in flight. */
function TopProgressBar() {
  const [active, setActive] = useState(false);

  useEffect(() => subscribeProgress(setActive), []);

  return (
    <div
      className={`fixed top-0 left-0 right-0 h-[3px] z-[200] overflow-hidden pointer-events-none transition-opacity duration-300 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="h-full w-1/3 bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-600 rounded-full animate-progress-sweep" />
    </div>
  );
}

export default TopProgressBar;
