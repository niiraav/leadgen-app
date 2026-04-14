"use client";

import React, { useState } from "react";
import { Mail, Phone, Linkedin } from "lucide-react";
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
}

export const ChannelButtons = React.memo(function ChannelButtons({
  contactEmail,
  contactLinkedin,
  phone,
  lead,
  onEmailCompose,
  compact = false,
}: ChannelButtonsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const cleanPhone = phone?.replace(/\D/g, "") ?? "";
  const waPhone = cleanPhone.startsWith("44") ? cleanPhone : `44${cleanPhone}`;
  const iconSize = compact ? 0.7 : 1;
  const btnClass = compact
    ? "p-1 rounded-md"
    : "p-2 rounded-lg";

  return (
    <>
      <div className="flex items-center gap-1.5">
        {onEmailCompose && (
          <button
            onClick={(e) => { e.stopPropagation(); onEmailCompose(); }}
            title="Compose email"
            className={`${btnClass} bg-blue/10 text-blue hover:bg-blue/20 transition-colors`}
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
                e.stopPropagation();
                if (lead) {
                  setPickerOpen(true);
                } else {
                  window.open(
                    `https://wa.me/${waPhone}`,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }
              }}
              title="WhatsApp"
              className={`${btnClass} bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors`}
            >
              <Icon path={mdiWhatsapp} size={iconSize} />
            </button>

            {/* SMS / iMessage — opens MessagePicker if lead data available */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (lead) {
                  setPickerOpen(true);
                } else {
                  window.location.href = `sms:${phone}`;
                }
              }}
              title="SMS / Message"
              className={`${btnClass} bg-blue/10 text-blue hover:bg-blue/20 transition-colors`}
            >
              <Icon path={mdiMessageText} size={iconSize} />
            </button>

            {/* Call — preserved as direct tel: link (hidden in compact) */}
            {!compact && (
              <a
                href={`tel:${phone}`}
                onClick={(e) => e.stopPropagation()}
                title="Call"
                className={`${btnClass} bg-surface-2 text-text-faint hover:text-text transition-colors`}
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
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
});
