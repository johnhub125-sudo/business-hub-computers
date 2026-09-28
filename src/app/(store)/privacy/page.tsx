import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const generateMetadata = () => policyMetadata("privacy");

export default function Page() {
  return <PolicyPage slug="privacy" />;
}
