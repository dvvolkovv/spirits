// src/pages/MyVideosPage.tsx
import { MyVideosList } from '../components/chat/smm/MyVideosList';

export default function MyVideosPage() {
  // Parent layout (App.tsx) ставит overflow-hidden на контент-обёртку,
  // поэтому страница сама должна управлять скроллом.
  return (
    <div className="flex-1 overflow-y-auto">
      <MyVideosList />
    </div>
  );
}
