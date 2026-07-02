import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings } from "@/hooks/useScriptProcessor";
import { useGetImageSettings } from "@workspace/api-client-react";

interface SettingsPanelProps {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  disabled?: boolean;
}

export function SettingsPanel({ settings, setSettings, disabled }: SettingsPanelProps) {
  const { data: serverSettings } = useGetImageSettings();

  return (
    <div className="flex flex-col gap-6 p-5 bg-card border rounded-lg shadow-sm">
      <h3 className="font-semibold text-sm tracking-tight text-card-foreground">Configuration</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Images per line</Label>
          <Select 
            disabled={disabled}
            value={settings.perPage.toString()} 
            onValueChange={(val) => setSettings({ ...settings, perPage: parseInt(val, 10) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Images per line" />
            </SelectTrigger>
            <SelectContent>
              {[2, 4, 6, 8].map(num => (
                <SelectItem key={num} value={num.toString()}>{num} images</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Image Source</Label>
          <Select 
            disabled={disabled}
            value={settings.provider} 
            onValueChange={(val) => setSettings({ ...settings, provider: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {(serverSettings?.availableProviders || ['pexels']).map(provider => (
                <SelectItem key={provider} value={provider}>
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Orientation</Label>
          <Select 
            disabled={disabled}
            value={settings.orientation} 
            onValueChange={(val: any) => setSettings({ ...settings, orientation: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Orientation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="landscape">Landscape</SelectItem>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="square">Square</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between sm:justify-start sm:gap-4 h-full pt-6">
          <Label className="text-sm font-medium">Safe Search</Label>
          <Switch 
            checked={settings.safeSearch}
            onCheckedChange={(val) => setSettings({ ...settings, safeSearch: val })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}