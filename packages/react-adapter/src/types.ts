export interface MutationState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface MutationResult<T, TVariables> extends MutationState<T> {
  mutate: (variables: TVariables) => Promise<T>;
  reset: () => void;
}

export interface CreateVariables<T> {
  data: T;
  params?: Record<string, any>;
}

export interface UpdateVariables<T> {
  id: string | number;
  data: T;
  params?: Record<string, any>;
}

export interface PatchVariables<T> {
  id: string | number;
  data: Partial<T>;
  params?: Record<string, any>;
}

export interface DeleteVariables {
  id: string | number;
  params?: Record<string, any>;
}