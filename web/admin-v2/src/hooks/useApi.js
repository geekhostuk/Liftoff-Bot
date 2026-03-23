import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/feedback/Toast.jsx';

export function useApi() {
  const { logout } = useAuth();
  const { toast } = useToast();

  const apiFetch = useCallback(async (method, path, body) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      logout();
      throw new Error('Session expired');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }, [logout]);

  const apiCall = useCallback(async (method, path, body, successMsg) => {
    try {
      const data = await apiFetch(method, path, body);
      if (successMsg) toast(successMsg, 'success');
      return data;
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  }, [apiFetch, toast]);

  return { apiFetch, apiCall };
}
