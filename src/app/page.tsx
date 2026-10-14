import { PicksApp } from '@/components/picks/picks-app';
import { SiteFooter } from '@/components/site-footer';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <PicksApp />
      <SiteFooter />
    </div>
  );
}
