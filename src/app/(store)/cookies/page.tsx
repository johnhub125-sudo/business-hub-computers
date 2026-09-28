import { PolicyPage, policyMetadata } from "@/components/store/policy-page";

export const generateMetadata = () => policyMetadata("cookies");

export default function Page() {
  return <PolicyPage slug="cookies" />;
}
