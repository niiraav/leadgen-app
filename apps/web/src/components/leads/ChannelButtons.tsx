"use client";

import React, { useState } from "react";
import { Mail, Phone, Linkedin, AlertTriangle } from "lucide-react";
import Icon from "@mdi/react";
import { mdiWhatsapp, mdiMessageText } from "@mdi/js";
import MessagePicker from "./MessagePicker";

interface ChannelButtonsProps {
  contactEmail?: string;
  contactLinkedin?: string;
  phone?: string;
  /** Full lead object for MessagePicker — pass when available */
  lead?: {
    id: string;
    business_name: string;
    category?: string;
    rating?: number;
    phone?: string;
    contact_phone?: string;
  };
  onEmailCompose?: () => void;
  /** Compact mode for table rows — smaller icons, no call button */
  compact?: boolean;
  /** Phase 4: do_not_contact blocks outbound sends */
  doNotContact?: boolean;
}

export const ChannelButtons = React.memo(function ChannelButtons({
  contactEmail,
  contactLinkedin,
  phone,
  lead,
  onEmailCompose,
  compact = false,
  doNotContact = false,
}: ChannelButtonsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerChannel, setPickerChannel] = useState<"whatsapp" | "sms" | undefined>(undefined);
  const cleanPhone = phone?.replace(/\D/g, "") ?? "";
  const waPhone = cleanPhone.startsWith("44") ? cleanPhone : `44${cleanPhone}`;
  const iconSize = compact ? 0.7 : 1;
  const btnClass = compact
    ? "p-1 rounded-md"
    : "p-2 rounded-lg";
  const dncBtnClass = doNotContact
    ? "opacity-40 cursor-not-allowed"
    : "";

  return (
    <>
      <div className="flex items-center gap-1.5">
        {doNotContact && (
          <span className={`${btnClass} bg-warning/10 text-warning`} title="Do not contact">
            <AlertTriangle className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </span>
        )}
        {onEmailCompose && (
          <button
            onClick={(e) => { if (!doNotContact) { e.stopPropagation(); onEmailCompose(); } }}
            title={doNotContact ? "Cannot email — do not contact" : "Compose email"}
            disabled={doNotContact}
            className={`${btnClass} bg-primary/10 text-primary hover:bg-primary/20 transition-colors ${dncBtnClass}`}
          >
            <Mail className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </button>
        )}
        {contactLinkedin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(contactLinkedin, "_blank", "noopener,noreferrer");
            }}
            title="Open LinkedIn"
            className={`${btnClass} bg-[#0a66c2]/10 text-[#0a66c2] hover:bg-[#0a66c2]/20 transition-colors`}
          >
            <Linkedin className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          </button>
        )}
        {phone && (
          <>
            {/* WhatsApp — opens MessagePicker if lead data available, else raw link */}
            <button
              onClick={(e) => {
                if (doNotContact) return;
                e.stopPropagation();
                if (lead) {
                  setPickerChannel("whatsapp");
                  setPickerOpen(true);
                } else {
                  window.open(
                    `https://wa.me/${waPhone}`,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }
              }}
              title={doNotContact ? "Cannot WhatsApp — do not contact" : "WhatsApp"}
              disabled={doNotContact}
              className={`${btnClass} bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors ${dncBtnClass}`}
            >
              <Icon path={mdiWhatsapp} size={iconSize} />
            </button>

            {/* SMS / iMessage — opens MessagePicker if lead data available */}
            <button
              onClick={(e) => {
                if (doNotContact) return;
                e.stopPropagation();
                if (lead) {
                  setPickerChannel("sms");
                  setPickerOpen(true);
                } else {
                  window.location.href = `sms:${phone}`;
                }
              }}
              title={doNotContact ? "Cannot SMS — do not contact" : "SMS / Message"}
              disabled={doNotContact}
              className={`${btnClass} bg-primary/10 text-primary hover:bg-primary/20 transition-colors ${dncBtnClass}`}
            >
              <Icon path={mdiMessageText} size={iconSize} />
            </button>

            {/* Call — preserved as direct tel: link (hidden in compact) */}
            {!compact && (
              <a
                href={`tel:${phone}`}
                onClick={(e) => e.stopPropagation()}
                title="Call"
                className={`${btnClass} bg-secondary text-foreground-faint hover:text-foreground transition-colors`}
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
          </>
        )}
      </div>

      {/* MessagePicker modal */}
      {lead && (
        <MessagePicker
          lead={lead}
          open={pickerOpen}
          onClose={() => {
            setPickerOpen(false);
            setPickerChannel(undefined);
          }}
          channel={pickerChannel}
        />
      )}
    </>
  );
});
