import { Card } from "@/components/ui/Card";
import { LogoutButton } from "@/components/ui/LogoutButton";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#6b4c86]">Settings</h1>
      <Card>
        <p className="text-sm text-gray-500 mb-4">Signed in to the shared staff dashboard.</p>
        <LogoutButton />
      </Card>
    </div>
  );
}
