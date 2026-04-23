"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";
import { CustomerCombobox } from "@/components/admin/customer/customer-combobox";
import {
  createBookingAction,
  getServiceConstraints,
  findAvailableSlotsAction,
} from "@/lib/actions/bookings";
import { format } from "date-fns";

interface FormData {
  customers: Array<{ id: string; full_name: string; phone: string }>;
  therapists: Array<{ id: string; full_name: string; color: string | null }>;
  rooms: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string; duration_minutes: number; price_ils: number }>;
}

/** Shape of a slot returned by findAvailableSlotsAction (dates already serialized). */
interface SerializedSlot {
  start: string;
  end: string;
  therapist_id: string;
  therapist_name: string;
  therapist_color: string | null;
  room_id: string;
  room_name: string;
}

interface BookingFormProps {
  formData: FormData;
}

export function BookingForm({ formData }: BookingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [serviceId, setServiceId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startAt, setStartAt] = useState("");
  const [status, setStatus] = useState("confirmed");
  const [notes, setNotes] = useState("");
  // Phase 5 deferred-assignment: when checked, submit with no therapist
  // so the booking lands as assignment_status='unassigned' and the
  // manager picks someone on /admin/assignments.
  const [leaveUnassigned, setLeaveUnassigned] = useState(false);

  // Filtered options based on service selection
  const [qualifiedTherapistIds, setQualifiedTherapistIds] = useState<string[]>([]);
  const [compatibleRoomIds, setCompatibleRoomIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<SerializedSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Reset dependent state inline so the effects below can stay pure (no
  // synchronous setState at the top of an effect body — see React docs on
  // https://react.dev/reference/react/useEffect#caveats ).
  function handleServiceChange(newServiceId: string) {
    setServiceId(newServiceId);
    setStartAt("");
    if (!newServiceId) {
      setQualifiedTherapistIds([]);
      setCompatibleRoomIds([]);
      setTherapistId("");
      setRoomId("");
      setSlots([]);
    }
  }

  // When service changes (to a non-empty value), fetch its constraints.
  useEffect(() => {
    if (!serviceId) return;

    let cancelled = false;
    getServiceConstraints(serviceId).then(({ therapistIds, roomIds }) => {
      if (cancelled) return;
      setQualifiedTherapistIds(therapistIds);
      setCompatibleRoomIds(roomIds);
      // Reset therapist/room selections if they are no longer valid.
      setTherapistId((prev) => (therapistIds.includes(prev) ? prev : ""));
      setRoomId((prev) => (roomIds.includes(prev) ? prev : ""));
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  // When service + date change, find available slots. We track an in-flight
  // cancellation flag so stale responses can't overwrite newer ones.
  useEffect(() => {
    if (!serviceId || !date) return;

    let cancelled = false;
    // Showing a loading indicator requires a synchronous setState here; the
    // rule's concern (cascading renders) doesn't apply because we only run
    // when serviceId/date/therapistId actually change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlotsLoading(true);
    findAvailableSlotsAction(serviceId, date, therapistId || undefined)
      .then((result) => {
        if (cancelled) return;
        setSlots(result);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, date, therapistId]);

  function handleSlotSelect(slot: SerializedSlot) {
    setStartAt(`${date}T${format(new Date(slot.start), "HH:mm")}`);
    if (!therapistId) setTherapistId(slot.therapist_id);
    if (!roomId) setRoomId(slot.room_id);
  }

  function handleSubmit(formDataObj: globalThis.FormData) {
    startTransition(async () => {
      const result = await createBookingAction(formDataObj);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
        toast.error("Couldn't create booking. See errors below.");
      } else if (result?.success) {
        toast.success("Booking created.");
        router.push("/admin/bookings");
      }
    });
  }

  // DEF-004: therapist/room lists must be empty until a service is picked,
  // otherwise the dropdowns still render all options even though disabled
  // (some browsers/OSes let users scroll a disabled <select>).
  const filteredTherapists = !serviceId
    ? []
    : formData.therapists.filter((t) => qualifiedTherapistIds.includes(t.id));
  const filteredRooms = !serviceId
    ? []
    : formData.rooms.filter((r) => compatibleRoomIds.includes(r.id));

  const selectedService = formData.services.find((s) => s.id === serviceId);

  return (
    <form action={handleSubmit}>
      <FormErrors errors={errors} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Form fields */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Booking Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="customer_id">Customer</Label>
                <CustomerCombobox
                  name="customer_id"
                  value={customerId}
                  onChange={(id) => setCustomerId(id)}
                  initialCustomers={formData.customers.map((c) => ({
                    id: c.id,
                    full_name: c.full_name,
                    phone: c.phone,
                    email: null,
                  }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Type to search by name, phone, or email. Walk-in? Pick
                  &quot;Create new customer&quot; at the bottom of the list.
                </p>
              </div>

              <div>
                <Label htmlFor="service_id">Service</Label>
                <Select
                  id="service_id"
                  name="service_id"
                  value={serviceId}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  required
                >
                  <option value="">Select service...</option>
                  {formData.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min, {(s.price_ils / 100).toFixed(0)} ILS)
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="therapist_id">Therapist</Label>
                <Select
                  id="therapist_id"
                  name="therapist_id"
                  value={leaveUnassigned ? "" : therapistId}
                  onChange={(e) => setTherapistId(e.target.value)}
                  required={!leaveUnassigned}
                  disabled={!serviceId || leaveUnassigned}
                >
                  <option value="">
                    {leaveUnassigned
                      ? "Unassigned — manager will assign later"
                      : !serviceId
                        ? "Select a service first..."
                        : filteredTherapists.length === 0
                          ? "No qualified therapists"
                          : "Select therapist..."}
                  </option>
                  {filteredTherapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </Select>
                {serviceId && filteredTherapists.length === 0 && !leaveUnassigned && (
                  <p className="mt-1 text-xs text-destructive">
                    No active therapist is qualified for this service. Assign
                    one on the{" "}
                    <Link
                      href={`/admin/services/${serviceId}`}
                      className="font-medium underline underline-offset-2"
                    >
                      service page
                    </Link>
                    , or mark existing therapists qualified on their profile.
                  </p>
                )}
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      id="leave_unassigned"
                      name="leave_unassigned"
                      type="checkbox"
                      checked={leaveUnassigned}
                      onChange={(e) => {
                        setLeaveUnassigned(e.target.checked);
                        if (e.target.checked) setTherapistId("");
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label
                      htmlFor="leave_unassigned"
                      className="text-xs font-normal text-muted-foreground"
                    >
                      Leave unassigned (manager picks later)
                    </Label>
                  </div>
                  {leaveUnassigned && (
                    <p className="pl-6 text-xs text-muted-foreground">
                      The booking is saved without a therapist pinned. The
                      on-call manager receives an SMS + WhatsApp alert once
                      payment confirms, and picks a therapist on{" "}
                      <Link
                        href="/admin/assignments"
                        className="font-medium underline underline-offset-2"
                      >
                        /admin/assignments
                      </Link>
                      . The therapist then has 2 hours to confirm; the
                      manager is re-alerted if they don&apos;t.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="room_id">Room</Label>
                <Select
                  id="room_id"
                  name="room_id"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  required
                  disabled={!serviceId}
                >
                  <option value="">
                    {!serviceId
                      ? "Select a service first..."
                      : filteredRooms.length === 0
                        ? "No compatible rooms"
                        : "Select room..."}
                  </option>
                  {filteredRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
                {serviceId && filteredRooms.length === 0 && (
                  <p className="mt-1 text-xs text-destructive">
                    No active room is compatible with this service. Link one
                    on the{" "}
                    <Link
                      href={`/admin/services/${serviceId}`}
                      className="font-medium underline underline-offset-2"
                    >
                      service page
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="start_at">Start Time</Label>
                  <Input
                    id="start_at_time"
                    type="time"
                    // DEF-017: lock to 15-minute grid so custom typed times
                    // don't produce 13:29 / 09:15 bookings that mis-align
                    // with availability slots.
                    step={900}
                    value={startAt ? startAt.split("T")[1] || "" : ""}
                    onChange={(e) =>
                      setStartAt(e.target.value ? `${date}T${e.target.value}` : "")
                    }
                    required
                  />
                  <input type="hidden" name="start_at" value={startAt} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Times snap to 15-minute intervals. Pick a slot on the
                    right to auto-fill.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="status">Initial Status</Label>
                <Select
                  id="status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="pending_payment">Pending Payment</option>
                  <option value="confirmed">Confirmed</option>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use &quot;Pending Payment&quot; if the customer hasn&apos;t paid yet.
                </p>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating..." : "Create Booking"}
          </Button>
        </div>

        {/* Right: Available slots */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available Slots</CardTitle>
          </CardHeader>
          <CardContent>
            {!serviceId ? (
              <p className="text-sm text-muted-foreground">
                Select a service and date to see available slots.
              </p>
            ) : slotsLoading ? (
              <p className="text-sm text-muted-foreground">Loading slots...</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available slots for this date.{" "}
                {!therapistId && "Try selecting a specific therapist."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {slots.map((slot, i) => {
                  const slotTime = format(new Date(slot.start), "HH:mm");
                  const isSelected =
                    startAt.includes(slotTime) &&
                    therapistId === slot.therapist_id &&
                    roomId === slot.room_id;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSlotSelect(slot)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="font-medium">{slotTime}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {slot.therapist_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {slot.room_name}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedService && (
              <p className="mt-3 text-xs text-muted-foreground">
                Duration: {selectedService.duration_minutes} min &middot; Price:{" "}
                {(selectedService.price_ils / 100).toFixed(0)} ILS
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
