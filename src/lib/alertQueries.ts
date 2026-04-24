import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listAlertSubscriptions,
  saveAlertSubscription,
  type AlertSubscription,
} from './alerts';

const alertSubscriptionsQueryKey = ['alerts', 'subscriptions'] as const;

export function useAlertSubscription(itemKey: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: alertSubscriptionsQueryKey,
    queryFn: () => listAlertSubscriptions(),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: saveAlertSubscription,
    onSuccess: (subscription) => {
      queryClient.setQueryData<AlertSubscription[]>(alertSubscriptionsQueryKey, (current = []) => {
        const rest = current.filter((item) => item.itemKey !== subscription.itemKey);
        return [subscription, ...rest];
      });
    },
  });

  return {
    subscription: query.data?.find((item) => item.itemKey === itemKey),
    isLoading: query.isLoading,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    error: saveMutation.error,
  };
}
