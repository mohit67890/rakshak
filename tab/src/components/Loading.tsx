/**
 * Raksha Tab — Loading Component
 */

interface LoadingProps {
  message?: string;
}

export function Loading({ message = "Loading..." }: LoadingProps) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center">
        <div className="inline-block w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}
