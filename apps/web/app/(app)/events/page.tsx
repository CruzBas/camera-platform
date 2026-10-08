"use client";

import { EventsList } from "@/components/events-list";
import { Card, CardContent } from "@/components/ui/card";

export default function EventsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Eventos</h1>
      <Card>
        <CardContent>
          <EventsList limit={100} />
        </CardContent>
      </Card>
    </>
  );
}
