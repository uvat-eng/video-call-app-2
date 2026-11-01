import { createFileRoute } from "@tanstack/react-router";
import Messenger from "@/components/messenger/Messenger";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  return <Messenger />;
}
