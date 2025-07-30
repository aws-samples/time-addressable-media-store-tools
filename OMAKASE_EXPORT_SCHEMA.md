# Omakase Export Configuration Schema

This document describes the JSON schema structure for the AWS SSM parameter that configures the Omakase Export Modal operations.

## Overview

The export modal reads a JSON configuration from the AWS SSM parameter specified by `OMAKASE_EXPORT_EVENT_PARAMETER`. This JSON defines available export operations and their configuration fields.

## Schema Structure

The root JSON object contains operation definitions as key-value pairs:

```json
{
  "operation_name": {
    "title": "Display Name",
    "properties": {
      "field_name": {
        "type": "string|number|boolean",
        "title": "Field Display Label",
        "default": "default_value",
        "description": "Field description"
      }
    },
    "required": ["field_name"]
  }
}
```

## Field Types

### String Fields

```json
"field_name": {
  "type": "string",
  "title": "Field Label",
  "default": "",
  "description": "Text input field",
  "placeholder": "Enter text..."
}
```

### Textarea Fields

```json
"field_name": {
  "type": "string",
  "format": "textarea",
  "title": "Field Label",
  "default": "",
  "description": "Multi-line text input",
  "placeholder": "Enter multiple lines..."
}
```

### Number Fields

```json
"field_name": {
  "type": "number",
  "title": "Field Label", 
  "default": 0,
  "description": "Numeric input field",
  "placeholder": "Enter number..."
}
```

### Integer Fields

```json
"field_name": {
  "type": "integer",
  "title": "Field Label", 
  "default": 0,
  "description": "Integer input field"
}
```

### Boolean Fields

```json
"field_name": {
  "type": "boolean",
  "title": "Field Label",
  "default": false,
  "description": "Checkbox field"
}
```

### Select Fields (Dropdown)

```json
"field_name": {
  "type": "string",
  "title": "Field Label",
  "enum": {
    "option1": "Option 1",
    "option2": "Option 2",
    "option3": "Option 3"
  },
  "default": "option1",
  "placeholder": "Select an option"
}
```

## Cloudscape Component Properties

You can pass additional properties to Cloudscape components using `cloudscapeProps` and `formFieldProps`, for example:

```json
"field_name": {
  "type": "string",
  "title": "Field Label",
  "cloudscapeProps": {
    "disabled": false,
    "readOnly": false,
    "invalid": false,
    "warning": false
  },
  "formFieldProps": {
    "constraintText": "Additional help text",
    "errorText": "Error message",
    "warningText": "Warning message",
    "info": "Info link or text"
  }
}
```

## Required Fields

Fields listed in the `required` array must be filled before export can proceed:

```json
{
  "operation_name": {
    "properties": { ... },
    "required": ["mandatory_field1", "mandatory_field2"]
  }
}
```

## Behavior

- The first operation in the JSON becomes the default selection
- Form fields are dynamically generated based on the `properties` object
- Default values populate fields on operation selection
- Required fields prevent export until completed
