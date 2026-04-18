import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';

interface NewConversationButtonProps {
  disabled?: boolean;
  onCreate: () => void;
}

export function NewConversationButton({ disabled, onCreate }: NewConversationButtonProps): JSX.Element {
  return (
    <Button variant="outline" className="w-full justify-start gap-2 rounded-2xl" onClick={onCreate} disabled={disabled}>
      <MessageSquarePlus className="h-4 w-4" />
      New conversation
    </Button>
  );
}
