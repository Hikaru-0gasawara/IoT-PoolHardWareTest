import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/controle")({
  loader: () => {
    throw redirect({ to: "/config", search: { tab: "controle-avancado" } });
  },
  component: () => null,
});
