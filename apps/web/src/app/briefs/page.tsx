import { redirect } from 'next/navigation';

/** The brief moved to the home page; keep old links working. */
export default function BriefsRedirect() {
  redirect('/');
}
