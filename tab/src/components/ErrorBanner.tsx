/**
 * Raksha Tab — Error Banner Component
 */

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
