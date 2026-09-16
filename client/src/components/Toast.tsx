import { useEffect, useState } from 'react';
import { useStore } from '../store';

export default function Toast() {
  const t = useStore(s => s.toast);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!t) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(timer);
  }, [t]);

  if (!t) return null;
  return <div className={'toast' + (show ? ' show' : '')}>{t.msg}</div>;
}
