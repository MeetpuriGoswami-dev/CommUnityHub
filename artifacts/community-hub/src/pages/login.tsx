import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAppContext } from "@/lib/contexts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Users, Loader2 } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAppContext();
  const { toast } = useToast();
  const [role, setRole] = useState<"admin" | "volunteer">("admin");
  const [email, setEmail] = useState(import.meta.env.VITE_DEMO_ADMIN_EMAIL || "admin@communityhub.local");
  const [password, setPassword] = useState(import.meta.env.VITE_DEMO_ADMIN_PASSWORD || "Admin@123456");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password, role);
      if (user.mustChangePassword) {
        navigate({ to: "/change-password" });
      } else if (user.role === "volunteer") {
        navigate({ to: "/volunteer-dashboard" });
      } else {
        navigate({ to: "/" });
      }
    } catch (error) {
      toast({ title: "Login failed", description: error instanceof Error ? error.message : "Please check the credentials.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <img src="/favicon.png" alt="CommUnity Hub Logo" className="mx-auto w-16 h-16 object-contain drop-shadow-md" />
          <CardTitle className="text-2xl">CommUnity Hub Login</CardTitle>
          <CardDescription>Use the credentials assigned by your organization admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={role} onValueChange={(value) => {
            const nextRole = value as "admin" | "volunteer";
            setRole(nextRole);
            if (nextRole === "admin") {
              setEmail(import.meta.env.VITE_DEMO_ADMIN_EMAIL || "admin@communityhub.local");
              setPassword(import.meta.env.VITE_DEMO_ADMIN_PASSWORD || "Admin@123456");
            } else {
              setEmail("");
              setPassword("");
            }
          }}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="admin" className="gap-2"><ShieldCheck className="w-4 h-4" /> Admin</TabsTrigger>
              <TabsTrigger value="volunteer" className="gap-2"><Users className="w-4 h-4" /> Volunteer</TabsTrigger>
            </TabsList>
            <TabsContent value="admin">
              <p className="text-sm text-muted-foreground mb-4">Admins and coordinators can manage organizations, needs, volunteers, surveys, and assignments.</p>
            </TabsContent>
            <TabsContent value="volunteer">
              <p className="text-sm text-muted-foreground mb-4">Volunteers sign in with temporary credentials created by an admin, then set a new password.</p>
            </TabsContent>
          </Tabs>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}