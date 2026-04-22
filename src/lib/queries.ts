import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  fetchHomeSignals,
  fetchPentagonSignals,
  fetchPsychologySignals,
  fetchSocialSignals,
} from './repository';

const sharedQueryConfig = {
  staleTime: 5 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  retry: 1,
  refetchOnWindowFocus: true,
} as const;

export function useHomeSignals() {
  return useQuery({
    queryKey: ['signals', 'home'],
    queryFn: fetchHomeSignals,
    ...sharedQueryConfig,
  });
}

export function usePentagonSignals() {
  return useQuery({
    queryKey: ['signals', 'pentagon'],
    queryFn: fetchPentagonSignals,
    ...sharedQueryConfig,
  });
}

export function usePsychologySignals() {
  return useQuery({
    queryKey: ['signals', 'psychology'],
    queryFn: fetchPsychologySignals,
    ...sharedQueryConfig,
  });
}

export function useSocialSignals() {
  return useQuery({
    queryKey: ['signals', 'social'],
    queryFn: fetchSocialSignals,
    ...sharedQueryConfig,
  });
}

export function usePentagonSignal() {
  const { slug } = useParams<{ slug: string }>();
  const query = usePentagonSignals();

  return {
    ...query,
    data: query.data?.find((item) => item.slug === slug),
  };
}

export function usePsychologySignal() {
  const { slug } = useParams<{ slug: string }>();
  const query = usePsychologySignals();

  return {
    ...query,
    data: query.data?.find((item) => item.slug === slug),
  };
}

export function useSocialSignal() {
  const { slug } = useParams<{ slug: string }>();
  const query = useSocialSignals();

  return {
    ...query,
    data: query.data?.find((item) => item.slug === slug),
  };
}
