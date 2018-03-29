const SHARED_MESSAGES = {
  SKIP_NOEMAIL: "User doesn't have an email address and will not be synchronized to customer.io",
  SKIP_NOTINSEGMENTS: "User is not in the whitelisted segments and will not be synchronized to customer.io",
  SKIP_NOCHANGES: "The contact in customer.io is already in synchronization with the user in Hull. No changes to process.",
  SKIP_NOTWHITELISTEDEVENTS: "The following events are not whitelisted and have been skipped for processing.",
  SKIP_NOIDVALUE: "User doesn't have a value for the attribute which is mapped to the identifier in customer.io.",
  ERROR_INVALIDEVENT: "Payload couldn't be mapped to Hull event.",
  ERROR_NOUSERIDENT: "Payload didn't contain any identifier for a Hull user.",
  ERROR_TRACKFAILED: "Event tracking failed, see innerException for details."
};

module.exports = SHARED_MESSAGES;
