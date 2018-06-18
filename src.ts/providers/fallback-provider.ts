'use strict';

import { Network } from './networks';
import { Provider } from './provider';

import * as errors from '../utils/errors';

// Returns:
//  - true is all networks match
//  - false if any network is null
//  - throws if any 2 networks do not match
function checkNetworks(networks: Array<Network>): boolean {
    var result = true;

    let check = null;
    networks.forEach((network) => {

        // Null
        if (network == null) {
            result = false;
            return;
        }

        // Have nothing to compre to yet
        if (check == null) {
            check = network;
            return;
        }

        // Matches!
        if (check.name === network.name &&
            check.chainId === network.chainId &&
            check.ensAddress === network.ensAddress) { return; }

        errors.throwError(
            'provider mismatch',
            errors.INVALID_ARGUMENT,
            { arg: 'providers', networks: networks }
        );
    });

    return result;
}

export class FallbackProvider extends Provider {
    private _providers: Array<Provider>;

    constructor(providers: Array<Provider>) {

        if (providers.length === 0) { throw new Error('no providers'); }

        // All networks are ready, we can know the network for certain
        let ready = checkNetworks(providers.map((p) => p.network));
        if (ready) {
            super(providers[0].network);

        } else {
            // The network won't be known until all child providers know
            let ready = Promise.all(providers.map((p) => p.getNetwork())).then((networks) => {
                if (!checkNetworks(networks)) {
                    errors.throwError('getNetwork returned null', errors.UNKNOWN_ERROR, { })
                }
                return networks[0];
            });

            super(ready);
        }
        errors.checkNew(this, FallbackProvider);

        // Preserve a copy, so we don't get mutated
        this._providers = providers.slice(0);
    }

    get providers() {
        // Return a copy, so we don't get mutated
        return this._providers.slice(0);
    }

    perform(method: string, params: any): any {
        // Creates a copy of the providers array
        var providers = this.providers;

        return new Promise((resolve, reject) => {
            var firstError = null;
            function next() {
                if (!providers.length) {
                    reject(firstError);
                    return;
                }

                var provider = providers.shift();
                provider.perform(method, params).then(function(result) {
                    resolve(result);
                }, function (error) {
                    if (!firstError) { firstError = error; }
                    next();
                });
            }
            next();
        });
    }
}

