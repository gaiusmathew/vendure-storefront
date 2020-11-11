import { ChangeDetectionStrategy, Component, ViewChild } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { StripeService, StripeCardComponent } from "ngx-stripe";

import { AddPayment } from "../../../common/generated-types";
import { DataService } from "../../../core/providers/data/data.service";
import { StateService } from "../../../core/providers/state/state.service";
import {
    StripeCardElementOptions,
    StripeElementsOptions,
} from "@stripe/stripe-js";

import { ADD_PAYMENT } from "./checkout-payment.graphql";
import { map, catchError, filter, switchMap } from "rxjs/operators";
import { notNullOrUndefined } from "src/app/common/utils/not-null-or-undefined";

@Component({
    selector: "vsf-checkout-payment",
    templateUrl: "./checkout-payment.component.html",
    styleUrls: ["./checkout-payment.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPaymentComponent {
    @ViewChild(StripeCardComponent) card: StripeCardComponent;
    cardNumber: string;
    expMonth: number;
    expYear: number;
    paymentErrorMessage: string | undefined;
    cardOptions: StripeCardElementOptions = {
        style: {
            base: {
                iconColor: "#666EE8",
                color: "#31325F",
                fontWeight: "300",
                fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                fontSize: "18px",
                "::placeholder": {
                    color: "#CFD7E0",
                },
            },
        },
    };

    elementsOptions: StripeElementsOptions = {
        locale: "es",
    };

    stripeTest: FormGroup;
    constructor(
        private dataService: DataService,
        private stateService: StateService,
        private router: Router,
        private route: ActivatedRoute,
        private stripeService: StripeService,
        private fb: FormBuilder
    ) {}

    ngOnInit() {
        this.stripeTest = this.fb.group({
            name: ['', [Validators.required]],
        });
    }

    getMonths(): number[] {
        return Array.from({ length: 12 }).map((_, i) => i + 1);
    }

    getYears(): number[] {
        const year = new Date().getFullYear();
        return Array.from({ length: 10 }).map((_, i) => year + i);
    }

    completeOrder() {
        this.dataService
            .mutate<AddPayment.Mutation, AddPayment.Variables>(ADD_PAYMENT, {
                input: {
                    method: "example-payment-provider",
                    metadata: {
                        foo: "bar",
                    },
                },
            })
            .subscribe(async ({ addPaymentToOrder }) => {
                switch (addPaymentToOrder?.__typename) {
                    case "Order":
                        const order = addPaymentToOrder;
                        if (
                            order &&
                            (order.state === "PaymentSettled" ||
                                order.state === "PaymentAuthorized")
                        ) {
                            await new Promise((resolve) =>
                                setTimeout(() => {
                                    this.stateService.setState(
                                        "activeOrderId",
                                        null
                                    );
                                    resolve();
                                }, 500)
                            );
                            this.router.navigate(
                                ["../confirmation", order.code],
                                { relativeTo: this.route }
                            );
                        }
                        break;
                    case "OrderPaymentStateError":
                    case "PaymentDeclinedError":
                    case "PaymentFailedError":
                    case "OrderStateTransitionError":
                        this.paymentErrorMessage = addPaymentToOrder.message;
                        break;
                }
            });
    }

    pay() {
        console.log("payment");
        this.stateService
            .select((state) => state.activeOrderId)
            .pipe(
                filter(notNullOrUndefined),
                switchMap((data) =>
                    this.stripeService.createPaymentMethod({
                        type: "card",
                        card: this.card.element,
                    })
                ),
                filter(notNullOrUndefined),
                switchMap((data) => {
                    console.log("II data", data);
                    return this.dataService.mutate<
                        AddPayment.Mutation,
                        AddPayment.Variables
                    >(ADD_PAYMENT, {
                        input: {
                            method: "stripe",
                            metadata: data,
                        },
                    });
                }),
                map((data): any => {
                    return data;
                })
            )
            .subscribe(
                async (data): Promise<any> => {
                    console.log("III", data);
                    const order = data.addPaymentToOrder;
                    if (
                        order &&
                        (order.state === "PaymentSettled" ||
                            order.state === "PaymentAuthorized")
                    ) {
                        await new Promise((resolve) =>
                            setTimeout(() => {
                                this.stateService.setState(
                                    "activeOrderId",
                                    null
                                );
                                resolve();
                            }, 500)
                        );
                        await this.router.navigate(
                            ["../confirmation", order.code],
                            { relativeTo: this.route }
                        );
                    }
                }
            );
    }

    createToken(): void {
        // const name = this.stripeTest.get('name').value;
        console.log('this.stripeTest.value', this.stripeTest.value)
        const name = this.stripeTest.value.name || 'Gaius Mathew';
        this.stripeService
            .createToken(this.card.element, { name })
            .subscribe((result) => {
                console.log('Token created', result)
                if (result.token) {
                    // Use the token
                    console.log(result.token.id);
                } else if (result.error) {
                    // Error creating the token
                    console.log(result.error.message);
                }
            });
    }
}
