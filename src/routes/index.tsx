import { createFileRoute } from "@tanstack/react-router";
import Messenger from "@/components/messenger/Messenger";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <Messenger />;
}
