// Command go-baseline captures a synthetic Generic Webhook request from pinned Go Shoutrrr.
// Run from the upstream Go checkout: go run <path-to-this-file> <fixture.json>.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/containrrr/shoutrrr/pkg/services/bark"
	"github.com/containrrr/shoutrrr/pkg/services/generic"
	"github.com/jarcoal/httpmock"
)

type fixture struct {
	Service          string `json:"service"`
	URL              string `json:"url"`
	Message          string `json:"message"`
	ResponseStatus   int    `json:"responseStatus"`
	ResponseCode     int    `json:"responseCode"`
	TransportFailure bool   `json:"transportFailure"`
}
type observation struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    any               `json:"body"`
	Outcome string            `json:"outcome"`
}

func main() {
	if len(os.Args) != 2 {
		log.Fatal("expected one fixture path")
	}
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	var input fixture
	if err := json.Unmarshal(data, &input); err != nil {
		log.Fatal(err)
	}
	parsed, err := url.Parse(input.URL)
	if err != nil || !strings.HasSuffix(parsed.Hostname(), ".example.test") ||
		((input.Service == "bark" && parsed.Scheme != "bark") ||
			(input.Service != "bark" && !strings.HasPrefix(parsed.Scheme, "generic"))) {
		log.Fatal("only synthetic Generic and Bark fixtures are accepted")
	}
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()
	var captured *observation
	httpmock.RegisterNoResponder(func(req *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(req.URL.Hostname(), ".example.test") {
			return nil, fmt.Errorf("unexpected destination")
		}
		payload, err := io.ReadAll(req.Body)
		if err != nil {
			return nil, err
		}
		var body any = string(payload)
		if json.Valid(payload) {
			if err := json.Unmarshal(payload, &body); err != nil {
				return nil, err
			}
		}
		captured = &observation{Method: req.Method, URL: req.URL.String(), Headers: map[string]string{
			"content-type": req.Header.Get("Content-Type"), "accept": req.Header.Get("Accept"),
		}, Body: body, Outcome: "success"}
		if input.TransportFailure {
			return nil, fmt.Errorf("synthetic transport failure")
		}
		status := input.ResponseStatus
		if status == 0 {
			status = 200
		}
		if input.Service == "bark" {
			code := input.ResponseCode
			if code == 0 {
				code = 200
			}
			return httpmock.NewStringResponse(status, fmt.Sprintf(`{"code":%d,"message":"synthetic response"}`, code)), nil
		}
		return httpmock.NewStringResponse(status, "synthetic response"), nil
	})
	if input.Service == "bark" {
		service := &bark.Service{}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, nil)
	} else {
		service := &generic.Service{}
		if strings.HasPrefix(parsed.Scheme, "generic+") {
			parsed, err = service.GetConfigURLFromCustom(parsed)
			if err != nil {
				log.Fatal("Go shortcut conversion failed")
			}
		}
		if err := service.Initialize(parsed, log.New(io.Discard, "", 0)); err != nil {
			log.Fatal("Go initialization failed")
		}
		err = service.Send(input.Message, nil)
	}
	if captured == nil {
		log.Fatal("no request captured")
	}
	if err != nil {
		switch {
		case input.TransportFailure:
			captured.Outcome = "transport-error"
		case input.ResponseStatus >= 300:
			captured.Outcome = fmt.Sprintf("http-status-%d", input.ResponseStatus)
		case input.ResponseCode != 0 && input.ResponseCode != 200:
			captured.Outcome = fmt.Sprintf("api-code-%d", input.ResponseCode)
		default:
			log.Fatal("unexpected Go send failure")
		}
	} else if input.TransportFailure || input.ResponseStatus >= 300 || (input.ResponseCode != 0 && input.ResponseCode != 200) {
		log.Fatal("Go did not reject the injected failure")
	}
	if err := json.NewEncoder(os.Stdout).Encode(captured); err != nil {
		log.Fatal(err)
	}
}
