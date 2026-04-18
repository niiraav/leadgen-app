import { useEffect } from 'react';

export default function SearchIndex() {
  useEffect(() => {
    window.location.href = '/search/google-maps';
  }, []);
  return null;
}
