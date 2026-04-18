import { useState } from "react";
import {
  ExpandableSection,
  FormField,
  Input,
  Modal,
  Multiselect,
  Select,
  SpaceBetween,
} from "@cloudscape-design/components";
import CancelModalFooter from "@/components/CancelModalFooter";
import UuidListInput from "@/components/UuidListInput";
import WebhookAcceptGetUrlsInput from "@/components/WebhookAcceptGetUrlsInput";
import WebhookTagsInput from "@/components/WebhookTagsInput";
import UndefinedBoolInput from "@/components/UndefinedBoolInput";
import { useRegister, useUpdate } from "@/hooks/useWebhooks";
import type { WebhookPost, WebhookPut, WebhookGet } from "@/types/tams";
import useAlertsStore from "@/stores/useAlertsStore";

const initialWebhookData: WebhookPost = {
  url: "",
  events: [],
  status: "created",
  api_key_name: undefined,
  api_key_value: undefined,
  flow_ids: undefined,
  source_ids: undefined,
  flow_collected_by_ids: undefined,
  source_collected_by_ids: undefined,
  accept_get_urls: undefined,
  accept_storage_ids: undefined,
  presigned: undefined,
  verbose_storage: undefined,
  tags: undefined,
};

const eventOptions = [
  "flows/created",
  "flows/updated",
  "flows/deleted",
  "flows/segments_added",
  "flows/segments_deleted",
  "sources/created",
  "sources/updated",
  "sources/deleted",
].map(value => ({
  label: value,
  value
}))

const statusOptions = [
  { label: "Created", value: "created" },
  { label: "Disabled", value: "disabled" },
  { label: "Started", value: "started", disabled: true, labelTag: "System Status" },
  { label: "Error", value: "error", disabled: true, labelTag: "System Status" },
];

const enabledStatuses = statusOptions.filter(opt => !opt.disabled).map(opt => opt.value);

type Props = {
  modalVisible: boolean;
  setModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  webhook?: WebhookGet;
};

const WebhookRegisterUpdateModal = ({ modalVisible, setModalVisible, webhook }: Props) => {
  const [urlError, setUrlError] = useState("");
  const [apiKeyValueError, setApiKeyValueError] = useState(
    webhook?.api_key_name ? "API Key Value is required when API Key Name is provided" : ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useRegister();
  const { update } = useUpdate();
  const addAlertItem = useAlertsStore((state) => state.addAlertItem);
  const delAlertItem = useAlertsStore((state) => state.delAlertItem);
  const getInitialData = (): WebhookPost | WebhookPut => {
    if (!webhook) return initialWebhookData;
    return webhook as WebhookPut;
  };
  const [formData, setFormData] = useState<WebhookPost | WebhookPut>(getInitialData());

  const handleDismiss = () => {
    setModalVisible(false);
    setFormData(getInitialData());
    setUrlError("");
    setApiKeyValueError(webhook?.api_key_name ? "API Key Value is required when API Key Name is provided" : "");
    setIsSubmitting(false);
  };

  const postWebhook = async () => {
    setIsSubmitting(true);
    const id = crypto.randomUUID();
    try {
      if (webhook) {
        await update(formData as WebhookPut);
      } else {
        await register(formData as WebhookPost);
      }
      addAlertItem({
        type: "success",
        dismissible: true,
        dismissLabel: "Dismiss message",
        content: `Webhook ${webhook ? 'updated' : 'registered'} successfully.`,
        id: id,
        onDismiss: () => delAlertItem(id),
      });
    } catch (error) {
      addAlertItem({
        type: "error",
        dismissible: true,
        dismissLabel: "Dismiss message",
        content: `Failed to ${webhook ? 'update' : 'register'} webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        id: id,
        onDismiss: () => delAlertItem(id),
      });
    }
    handleDismiss();
  };

  return (
    <Modal
      key={String(modalVisible)}
      onDismiss={handleDismiss}
      visible={modalVisible}
      footer={
        <CancelModalFooter
          onCancel={handleDismiss}
          onSubmit={postWebhook}
          submitText={webhook ? "Update" : "Register"}
          submitDisabled={
            !formData.url ||
            (formData.api_key_name !== undefined && !formData.api_key_value) ||
            !enabledStatuses.includes(formData.status ?? "")
          }
          submitLoading={isSubmitting}
          cancelDisabled={isSubmitting}
        />
      }
      header={`${webhook ? 'Update' : 'Register'} Webhook`}
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <SpaceBetween size="xs">
          <FormField
            description="The URL to which the service instance should make HTTP POST requests with event data"
            label="Url*"
            errorText={urlError}
          >
            <Input
              value={formData.url}
              onChange={({ detail }) => setFormData({ ...formData, url: detail.value })}
              onBlur={() => {
                if (formData.url) {
                  setUrlError("");
                } else {
                  setUrlError("Url is required");
                }
              }}
            />
          </FormField>
          <FormField
            description="List of event types to receive"
            label="Events"
          >
            <Multiselect
              selectedOptions={eventOptions.filter((opt) =>
                formData.events.includes(opt.value as WebhookPost["events"][number]),
              )}
              onChange={({ detail }) => setFormData({ ...formData, events: detail.selectedOptions.map(opt => opt.value!) as WebhookPost["events"] })}
              options={eventOptions}
              inlineTokens
            />
          </FormField>
          <FormField
            description="Status of the Webhook"
            label="Status"
            errorText={webhook && formData.status && !enabledStatuses.includes(formData.status)
              ? "This status is system-managed"
              : undefined
            }
          >
            <Select
              selectedOption={statusOptions.find(opt => opt.value === formData.status) ?? null}
              onChange={({ detail }) =>
                setFormData({ ...formData, status: detail.selectedOption.value as WebhookPost["status"] })
              }
              options={statusOptions}
            />
          </FormField>
          <ExpandableSection headerText="API Key Auth" defaultExpanded={!!webhook?.api_key_name}>
            <SpaceBetween size="m">
              <FormField
                description="The HTTP header name that is added to the event POST"
                label="API Key Name"
              >
                <Input
                  value={formData.api_key_name ?? ""}
                  onChange={({ detail }) => {
                    setFormData({ ...formData, api_key_name: detail.value || undefined });
                    if (!detail.value) {
                      setFormData(prev => ({ ...prev, api_key_name: undefined, api_key_value: undefined }));
                      setApiKeyValueError("");
                    }
                  }}
                />
              </FormField>
              <FormField
                description="The value that the HTTP header 'api_key_name' will be set to"
                label="API Key Value"
                errorText={apiKeyValueError}
              >
                <Input
                  value={formData.api_key_value ?? ""}
                  disabled={!formData.api_key_name}
                  onChange={({ detail }) => {
                    setFormData({ ...formData, api_key_value: detail.value || undefined });
                    if (apiKeyValueError) setApiKeyValueError("");
                  }}
                  onBlur={() => {
                    if (formData.api_key_name && !formData.api_key_value) {
                      setApiKeyValueError("API Key Value is required when API Key Name is provided");
                    } else {
                      setApiKeyValueError("");
                    }
                  }}
                  type="password"
                  spellcheck={false}
                  disableBrowserAutocorrect={true}
                />
              </FormField>
            </SpaceBetween>
          </ExpandableSection>
          <ExpandableSection headerText="Advanced">
            <SpaceBetween size="m">
              <UuidListInput
                description="Limit Flow and Flow Segment events to Flows in the given list of Flow IDs"
                label="Flow Ids"
                uuids={formData.flow_ids}
                setUuids={(ids) => setFormData(prev => ({
                  ...prev,
                  flow_ids: typeof ids === 'function' ? ids(prev.flow_ids) : ids
                }))}
              />
              <UuidListInput
                description="Limit Flow, Flow Segment and Source events to Sources in the given list of Source IDs"
                label="Source Ids"
                uuids={formData.source_ids}
                setUuids={(ids) => setFormData(prev => ({
                  ...prev,
                  source_ids: typeof ids === 'function' ? ids(prev.source_ids) : ids
                }))}
              />
              <UuidListInput
                description="Limit Flow and Flow Segment events to those with Flow that is collected by a Flow Collection in the given list of Flow Collection IDs"
                label="Flow Collected By Ids"
                uuids={formData.flow_collected_by_ids}
                setUuids={(ids) => setFormData(prev => ({
                  ...prev,
                  flow_collected_by_ids: typeof ids === 'function' ? ids(prev.flow_collected_by_ids) : ids
                }))}
              />
              <UuidListInput
                description="Limit Flow, Flow Segment and Source events to those with Source that is collected by a Source Collection in the given list of Source Collection IDs"
                label="Source Collected By Ids"
                uuids={formData.source_collected_by_ids}
                setUuids={(ids) => setFormData(prev => ({
                  ...prev,
                  source_collected_by_ids: typeof ids === 'function' ? ids(prev.source_collected_by_ids) : ids
                }))}
              />
              <WebhookAcceptGetUrlsInput
                description="List of labels of URLs to include in the get_urls property in flows/segments_added events"
                label="Accept Get Urls"
                values={formData.accept_get_urls}
                setValues={(ids) => setFormData(prev => ({
                  ...prev,
                  accept_get_urls: typeof ids === 'function' ? ids(prev.accept_get_urls) : ids
                }))}
              />
              <UuidListInput
                description="List of storage_ids to include in the get_urls property in flows/segments_added events"
                label="Accept Storage Ids"
                uuids={formData.accept_storage_ids}
                setUuids={(ids) => setFormData(prev => ({
                  ...prev,
                  accept_storage_ids: typeof ids === 'function' ? ids(prev.accept_storage_ids) : ids
                }))}
              />
              <UndefinedBoolInput
                description="Whether to include presigned/non-presigned URLs in the get_urls property in flows/segments_added events"
                label="Presigned"
                undefinedBool={formData.presigned}
                setUndefinedBool={(ids) => setFormData(prev => ({
                  ...prev,
                  presigned: typeof ids === 'function' ? ids(prev.presigned) : ids
                }))}
              />
              <UndefinedBoolInput
                description="Whether to include storage metadata in the get_urls property in flows/segments_added events"
                label="Verbose Storage"
                undefinedBool={formData.verbose_storage}
                setUndefinedBool={(ids) => setFormData(prev => ({
                  ...prev,
                  verbose_storage: typeof ids === 'function' ? ids(prev.verbose_storage) : ids
                }))}
              />
            </SpaceBetween>
          </ExpandableSection>
          <ExpandableSection headerText="Tags">
            <WebhookTagsInput
              description="Key is a freeform string. Value is a freeform string, or an array of freeform strings"
              tags={formData.tags}
              setTags={(tags) => setFormData(prev => ({
                ...prev,
                tags: typeof tags === 'function' ? tags(prev.tags) : tags
              }))}
            />
          </ExpandableSection>
        </SpaceBetween>
      </form>
    </Modal>
  );
};

export default WebhookRegisterUpdateModal;
